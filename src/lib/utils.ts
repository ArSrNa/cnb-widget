// 兼容 components.json 中 `utils: "@/lib/utils"` 别名：
// 官方 shadcn 组件的 cn 实现来自 `cn` 包（clsx + tailwind-merge 的编译版），
// 这里直接透传，保证全项目只有一个 cn 来源。
export { cn } from "cn";
