# PseudoRoku
議事録をいい感じにレンダリングしてくれるツール

[npm](https://www.npmjs.com/package/pseudoroku)

# 使用例
[2022年セキュリティ・キャンプL3（Cコンパイラゼミ）ログ](https://sozysozbot.github.io/seccamp-2022-c-compiler-seminar/)

# 使い方

log_all.txt:

````
$DATE「2022年9月19日」
阿部「ところで、進捗ってどんな感じなんです？」
江藤「来月辺りにはリリースできそうとのことです」
$IMAGE「sample.jpg」
阿部「了解です。そういえば、先週あたりにこんな記事が出ていましたが、」
$URL「https://example.com/news/baz」
江藤「ああ、このニュースねぇ。」
$blockquote
```
foo
bar
baz
```
$HTML「ということで、この件はかなり<u>重要</u>になってくると考えているんだ」
鈴木「そうでしたか。ところで、」
$source
```c
#include <stdio.h>
int main(void) {
	return 0;
}
```
阿部「」
$VIDEO「video.mp4」
江藤「ところで、これお願いできます？」
$JOIN{阿部}{鈴木}「無理です」
````

censor_list.tsv:
```tsv
阿部	Aさん
江藤	Eさん
鈴木	Sさん
```

profile_lookup.tsv:
```tsv
Aさん	https://example.com/foo
Eさん	https://example.com/bar
Sさん	https://example.com/baz
```

template.html:
```html
<!DOCTYPE html>
<head>
	<meta charset="utf-8">
	<title>ログ</title>
	$css
</head>
<body>
<h1>ログ</h1>
<h2>概要</h2>
<p>このログは、かくかくしかじかの経緯でどうこう。</p>
<h2>ログ本体</h2>$content</body>
```

```js
import { PseudoRoku } from 'pseudoroku';
new PseudoRoku({
	input: "./log_all.txt",
	censor_list: "./censor_list.tsv",
	output: "docs/index.html",
	template: './template.html',
	profile_lookup: './profile_lookup.tsv',
	getIconPathFromCensoredName: name => `icons/${name}.png`, // 出力された HTML からの相対パスで指定
	getMediaPath: media => `media/${media}`, // 出力された HTML からの相対パスで指定
}).doEverything();
```

出力された docs/index.html と同じところに icons フォルダと media フォルダを作り、icons フォルダに `Aさん.png`, `Eさん.png` を用意し、 media フォルダに `sample.jpg` や `video.mp4` を用意することで、レンダリングされる。
