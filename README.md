# ClassroomTube

Google Classroom の指定URLをバックエンドから取得して、YouTube風のUIで検索・再生・動画リスト管理をするRender Web Service用の最小構成です。

## Render

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `NODE_VERSION=20`

`render.yaml` は使わなくても、この4項目だけでデプロイできます。

## 重要

Google Classroom のページがログイン必須の場合、RenderサーバーからはユーザーのGoogleログイン状態を自動的には共有できません。このプロジェクトはその場合、検索やメタデータ取得時にGoogle側のログインページ/403等を返すことがあります。

また、動画プレイヤーは現在、指定どおりブラウザから
`https://classroom.google.com/u/0/n/player?v=動画ID`
をiframeで開く実装です。Google Classroom側がiframe表示を許可していない場合は、プレイヤー部分が表示されないため「Classroomで開く」ボタンを使う形になります。

## Cookie

動画リストはブラウザの `videoList` Cookie に動画IDだけをJSON配列として保存します。サーバーDBは使いません。
