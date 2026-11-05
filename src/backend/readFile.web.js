// A file picked with expo-document-picker, as text (web: the browser's File object).
export const readPickedFile = (asset) => (asset.file?.text ? asset.file.text() : fetch(asset.uri).then((r) => r.text()));
