import * as fs from 'fs'
import md5 from 'md5';

type Elem = { name: string, content: string, lang?: string };
type Content = { type: "plaintext" | "url" | "blockquote" | "image" | "html" | "video", data: string } | { type: "source", data: string, lang: string };
type Elem2 = { name: string, content: Content[] };

function escapeHTML(unsafeText: string) {
	return unsafeText.replace(
		/[&'`"<>]/g,
		function (match: string) {
			return {
				'&': '&amp;',
				"'": '&#x27;',
				'`': '&#x60;',
				'"': '&quot;',
				'<': '&lt;',
				'>': '&gt;',
			}[match as '&' | "'" | '`' | '"' | '<' | '>'] ?? ""
		}
	);
}

function assert(flag: boolean, msg: string) {
	if (!flag) {
		throw new Error(msg);
	}
}

function lines_to_elems(lines: string[]): Elem[] {
	const ans: Elem[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === "") {
			continue;
		} else if (line === "$source") {
			assert(lines[i + 1].startsWith("```"), "$source の後に ``` がない");
			const lang = lines[i + 1].slice(3);
			let content = "";
			let j = i + 2;
			for (; !lines[j].startsWith("```"); j++) {
				content += lines[j] + "\n";
			}
			i = j; // the i++ in the for-loop will compensate for the closing ```
			ans.push({ name: "$source", content, lang });
		} else if (line === "$blockquote") {
			assert(lines[i + 1].startsWith("```"), "$blockquote の後に ``` がない");
			const lang = lines[i + 1].slice(3);
			let content = "";
			let j = i + 2;
			for (; !lines[j].startsWith("```"); j++) {
				content += lines[j] + "\n";
			}
			i = j; // the i++ in the for-loop will compensate for the closing ```
			ans.push({ name: "$blockquote", content, lang });
		} else {
			const ind = line.indexOf("「");
			const name = line.slice(0, ind);
			assert(line.slice(-1) == "」", `${i + 1} 行目の末尾に閉じカギカッコ以外の文字がある`);
			const content = line.slice(ind + 1, -1);
			ans.push({ name, content })
		}
	}
	return ans;
}

function group_same_person(elems: Elem[]): Elem2[] {
	const ans: Elem2[] = [];
	for (let i = 0; i < elems.length; i++) {
		// same person
		if (ans[ans.length - 1] && elems[i].name === ans[ans.length - 1].name && !elems[i].name.startsWith("$")) {
			ans[ans.length - 1].content.push({ type: "plaintext", data: elems[i].content });
		} else if (elems[i].name === "$URL") {
			ans[ans.length - 1].content.push({ type: "url", data: elems[i].content });
		} else if (elems[i].name === "$HTML") {
			ans[ans.length - 1].content.push({ type: "html", data: elems[i].content });
		} else if (elems[i].name === "$IMAGE") {
			ans[ans.length - 1].content.push({ type: "image", data: elems[i].content });
		} else if (elems[i].name === "$VIDEO") {
			ans[ans.length - 1].content.push({ type: "video", data: elems[i].content });
		} else if (elems[i].name === "$blockquote") {
			ans[ans.length - 1].content.push({ type: "blockquote", data: elems[i].content });
		} else if (elems[i].name === "$source") {
			ans[ans.length - 1].content.push({ type: "source", data: elems[i].content, lang: elems[i].lang ?? "" });
		} else {
			ans.push({ name: elems[i].name, content: [{ type: "plaintext", data: elems[i].content }] });
		}
	}
	return ans;
}

// copied and modified from https://codepremix.com/detect-urls-in-text-and-create-a-link-in-javascript
function replaceURLs(message: string): string {
	if (!message) return "";

	var urlRegex = /(((https?:\/\/)|(www\.))[^\s]+)/g;
	return message.replace(urlRegex, function (url: string) {
		var hyperlink = url;
		if (!hyperlink.match('^https?:\/\/')) {
			hyperlink = 'http://' + hyperlink;
		}
		return '<a href="' + hyperlink + '" target="_blank" rel="noopener noreferrer">' + url + '</a>'
	});
}

export class PseudoRoku {
	input: string;
	censor_list: string | undefined;
	output: string;
	profile_lookup: string;
	template: string;
	show_powered_by: boolean;
	getIconPathFromCensoredName: (censored_name: string) => string;
	getMediaPath: (media: string) => string = (media: string) => `media/${media}`;

	constructor(o: {
		input: string,
		censor_list?: string,
		output: string,
		profile_lookup: string,
		template: string,
		getIconPathFromCensoredName: (censored_name: string) => string,
		getMediaPath?: (media: string) => string,
		hidePoweredBy?: boolean,
	}) {
		this.input = o.input;
		this.censor_list = o.censor_list;
		this.output = o.output;
		this.profile_lookup = o.profile_lookup;
		this.template = o.template;
		this.getIconPathFromCensoredName = o.getIconPathFromCensoredName;
		this.show_powered_by = !o.hidePoweredBy;
		if (o.getMediaPath) {
			this.getMediaPath = o.getMediaPath;
		}
	}

	public doEverything() {
		const data = fs.readFileSync(this.input, { encoding: 'utf8', flag: 'r' });
		const lines = data.split("\n");

		const censor_table = !this.censor_list ? null : fs.readFileSync(this.censor_list, { encoding: 'utf8', flag: 'r' }).split("\n").map(a => a.split("\t"));
		const profile_lookup_table = fs.readFileSync(this.profile_lookup, { encoding: 'utf8', flag: 'r' }).split("\n").map(a => a.split("\t"));

		function censor(unsafeText: string) {
			if (!censor_table) return unsafeText;
			for (let i = 0; i < censor_table.length; i++) {
				unsafeText = unsafeText.replace(new RegExp(censor_table[i][0], "g"), censor_table[i][1].trim());
			}
			return unsafeText;
		}

		function elems_to_html(elems: Elem2[]): string {
			let ans = ``;
			for (let i = 0; i < elems.length; i++) {
				if (elems[i].name === "$DATE") {
					ans += `<h3 class="date">${escapeHTML(censor(elems[i].content[0].data))}</h3>\n`;
				} else {
					ans += `<div class="one_person">\n`;
					const rendered_content = elems[i].content.map(renderContent).join("\n\t\t");
					const html_element_id = md5(rendered_content);
					if (elems[i].name.startsWith("$JOIN")) {
						// "$JOIN{foo}{bar}{baz}"
						// ↓ .slice
						// "foo}{bar}{baz"
						// ↓ .split
						// ["foo", "bar", "baz"]
						const names = elems[i].name.slice("$JOIN{".length, -1).split("}{");
						ans += "\t<div>" + names.map(n => getLinkedIconFromUncensoredName(n, 48 / names.length)).join("") + `</div>
	<div class="name_and_content" onmouseover="document.getElementById('permalink_${html_element_id}').style.visibility = 'visible'" onmouseout="document.getElementById('permalink_${html_element_id}').style.visibility = 'hidden'">
		<span class="name">${names.length > 5 ? "一同" : names.map(n => getLinkedNameFromUncensoredName(n)).join("・")}</span><a id="permalink_${html_element_id}" href="#permalink_${html_element_id}" class="permalink">¶</a>
		${rendered_content}
	</div>`;
					} else {
						ans += `\t<div>${getLinkedIconFromUncensoredName(elems[i].name, 48)}</div>
	<div class="name_and_content" onmouseover="document.getElementById('permalink_${html_element_id}').style.visibility = 'visible'" onmouseout="document.getElementById('permalink_${html_element_id}').style.visibility = 'hidden'">
		<span class="name">${getLinkedNameFromUncensoredName(elems[i].name)}</span><a id="permalink_${html_element_id}" href="#permalink_${html_element_id}" class="permalink">¶</a>
		${rendered_content}
	</div>`;
					}
					ans += `\n</div>\n`;
				}
			}
			return ans;
		}

		function getLinkedNameFromUncensoredName(name: string) {
			const profileURL = profile_lookup_table.filter(k => k[0] === escapeHTML(censor(name)))[0]?.[1].trim();
			if (!profileURL) {
				return `${escapeHTML(censor(name))}`
			} else {
				return `<a href="${profileURL}" target="_blank" rel="noopener noreferrer">${escapeHTML(censor(name))}</a>`
			}
		}

		const getLinkedIconFromUncensoredName = (name: string, size: number): string => {
			const profileURL = profile_lookup_table.filter(k => k[0] === escapeHTML(censor(name)))[0]?.[1].trim();
			const img = `<img alt="${escapeHTML(censor(name))}" class="icon" src="${this.getIconPathFromCensoredName(censor(name))}" height="${size}px">`;
			if (!profileURL) { // either undefined or empty
				return img;
			} else {
				return `<a href="${profileURL}" target="_blank" rel="noopener noreferrer">${img}</a>`
			}
		}

		const renderContent: (e: Content) => string = (e: Content) => {
			const censored = censor(e.data);
			if (e.type === "url") {
				return `<div class="content"><a href="${escapeHTML(censored)}" target="_blank" rel="noopener noreferrer">${escapeHTML(censored)}</a></div>`;
			} else if (e.type === "plaintext") {
				return `<div class="content">${replaceURLs(escapeHTML(censored))}</div>`;
			} else if (e.type === "html") {
				return `<div class="content">${censored}</div>`;
			} else if (e.type === "blockquote") {
				return `<blockquote>${replaceURLs(escapeHTML(censored))}</blockquote>`;
			} else if (e.type === "image") {
				return `<div class="content"><img width="500" src="${this.getMediaPath(escapeHTML(censored))}"></div>`;
			} else if (e.type === "source") {
				// CSS class here is the format expected by [highlight.js](https://highlightjs.org/),
				// though the use of highlight.js is by no means necessary.
				return `<pre><code class="language-${e.lang}">${escapeHTML(censored)}</code></pre>`;
			} else if (e.type === "video") {
				return `<div class="content"><video controls width="500" src="${this.getMediaPath(escapeHTML(censored))}"></video></div>`;
			} else {
				const _: never = e.type;
				throw new Error("Should not reach here: unexpected Content.type");
			}
		}

		fs.writeFileSync(this.output,
			fs.readFileSync(this.template, { encoding: 'utf8', flag: 'r' })
				.replace(/\$css/g, `<meta name="viewport" content="width=device-width">\n<style>
		img.icon {
			border-radius: 50%;
		}
		div.one_person {
			display: flex;
			padding-bottom: 10px;
		}
		blockquote {
			position: relative;
			border-left: 3px solid #005242;
			padding-left: 10px;
			margin-inline-start: 10px;
			white-space: pre-wrap;
		}
		a {
			overflow-wrap: anywhere;
		}
		h3 {
			margin-top: 15px;
		}
		.name a {
			text-decoration: none;
			color: inherit;
		}
		.name a:hover {
			text-decoration: underline;
		}
		div.name_and_content {
			padding-left: 10px;
		}
		pre {
			white-space: pre-wrap;
		}
		body {
			text-size-adjust: 100%;
			-webkit-text-size-adjust: 100%;
		}
		.permalink {
			margin-left: 15px;
			padding: .2em .6em .3em;
			font-size: 75%;
			font-weight: 700;
			line-height: 1;
			color: #fff;
			text-align: center;
			white-space: nowrap;
			vertical-align: center;
			border-radius: .25em;
			background-color: #666666;
			text-decoration: none;
			visibility: hidden;
		}
	</style>`)
				.replace(/\$content/g, elems_to_html(group_same_person(lines_to_elems(lines))) +  (this.show_powered_by ? `\n<div style="font-size: 70%; display: flex; justify-content: center;">
	<div>
		Powered by <a href="https://github.com/sozysozbot/PseudoRoku">PseudoRoku</a>, which is designed by <a href="https://twitter.com/hsjoihs">hsjoihs</a>. <a href="https://github.com/sozysozbot/PseudoRoku/issues">Feel free to report any issues</a>.
	</div>
</div>` : ""))
		);
	}
}