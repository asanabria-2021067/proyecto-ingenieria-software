import nextConfig from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [...nextConfig, ...coreWebVitals];

export default eslintConfig;
