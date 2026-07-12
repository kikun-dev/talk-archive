/**
 * レコード・トーク削除時に DB 行の削除は成功したが Storage ファイルの削除に失敗したことを表すエラー
 * recordUseCases / conversationUseCases の双方から使うため専用ファイルに切り出している
 */
export class StorageCleanupError extends Error {}
