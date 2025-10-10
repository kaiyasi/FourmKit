// 導出新的模板編輯器系統
export { default as NewTemplateEditor } from './NewTemplateEditor'
export { default as IGPreview } from './IGPreview'

// 導出步驟組件
export { default as TemplateInfoStep } from './steps/TemplateInfoStep'
export { default as PostTemplateStep } from './steps/PostTemplateStep'
export { default as PhotoTemplateStep } from './steps/PhotoTemplateStep'
export { default as CaptionTemplateStep } from './steps/CaptionTemplateStep'

// 保留舊的編輯器作為備份
export { default as LegacyTemplateEditor } from './TemplateEditor'