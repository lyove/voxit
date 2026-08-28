/**
 * fluent-ffmpeg / ffmpeg-static 类型声明（兜底）
 * 当 @types/fluent-ffmpeg 或 ffmpeg-static 未安装时，避免 TS 编译报错
 */
declare module 'fluent-ffmpeg' {
  const ffmpeg: any;
  export default ffmpeg;
}

declare module 'ffmpeg-static' {
  const path: string;
  export default path;
}