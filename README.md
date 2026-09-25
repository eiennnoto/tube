# Classroom PCK Video Site

Render Web Service向けの、YouTube風UIの最小構成です。

## できること

- `/api/search?q=...` から `https://classroom.google.com/u/0/n/pck?q=...` を取得
- 検索ページ内にある `n/pck?v=動画ID` のリンクを抽出
- `/api/video/:id` で `https://classroom.google.com/u/0/n/pck?v=動画ID` を取得
- ページ内の `<title>`, description系meta, `<iframe src>` を抽出
- 取得した iframe URL を動画プレイヤーへ設定
- 動画IDだけをブラウザCookieに保存
- Render再起動後も、同じブラウザのCookieはそのブラウザ側に残る

## Render設定

Runtime: Node

Build Command:
npm install

Start Command:
npm start

Web Serviceとしてデプロイしてください。

## 重要

このコードはGoogle ClassroomのログインセッションCookieをRenderへ転送しません。

そのため、取得元ページがログイン必須の場合、Renderからの単純なHTML取得ではログイン後の検索結果・動画情報を取得できません。ログイン必須のデータについては、Google Workspace/Google Classroomの公式認証・APIを使う構成が必要です。

また、ブラウザの第三者Cookie制限によって、Render上のページからGoogle Classroomをiframe表示した際にログイン状態が維持されない場合があります。その場合は「Classroomで開く」ボタンから元ページを開く動作を残しています。

## Cookie

Cookie名:
pck_video_ids

Cookieには動画IDをカンマ区切りで保存し、最大40件に制限しています。

動画リスト自体はサーバーのファイルに保存していないので、Renderの再起動やデプロイで消える方式ではありません。ブラウザを変えると別リストになります。


## 「検索結果が0件」の確認

この版では `/api/search?q=テスト` のJSONに `finalUrl`, `upstreamStatus`, `isGoogleLogin`, `htmlLength` を出します。

特に `isGoogleLogin: true` なら、RenderからGoogle Classroomを未ログイン状態で取得しているのが原因です。その場合、HTMLの正規表現を直すだけでは検索結果は取得できません。


## 動画埋め込み方式

動画再生時は、取得したiframeのsrcではなく、動画IDから以下のURLを直接iframeへ設定します。

`https://classroom.google.com/u/0/n/pck?v=動画ID`

なお、Google Classroomのページ自体は別オリジンなので、親ページのCSS/JavaScriptからそのiframe内部のヘッダーやボタンを直接削除することはブラウザのSame-Origin Policy上できません。必要ならiframeの上に同サイズのカバーを置いて視覚的に隠す方式にする必要があります。


## 動画プレイヤー

動画は動画IDから次のURLを直接iframeへ設定します。

`https://classroom.google.com/n/player?v=動画ID`


現在の動画プレイヤーURL:
`https://classroom.google.com/u/0/n/player?v=動画ID`
