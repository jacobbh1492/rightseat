import { File } from 'expo-file-system';

// A file picked with expo-document-picker (copied to the cache), as text.
export const readPickedFile = (asset) => new File(asset.uri).text();
