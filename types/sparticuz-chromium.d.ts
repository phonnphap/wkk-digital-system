// types/sparticuz-chromium.d.ts
// วางไว้ที่ root ของ project หรือใน types/ folder
// แก้ TypeScript ไม่เจอ type ของ @sparticuz/chromium

declare module "@sparticuz/chromium" {
  const chromium: {
    args: string[];
    defaultViewport: { width: number; height: number } | null;
    executablePath: () => Promise<string>;
    headless: boolean;
  };
  export default chromium;
}