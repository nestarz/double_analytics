import {
  type TwindConfig,
  defineConfig,
  install,
  observe,
} from "https://esm.sh/@twind/core@1.1.3";
import presetTailwind from "https://esm.sh/@twind/preset-tailwind@1.1.4";
import presetAutoprefix from "https://esm.sh/@twind/preset-autoprefix@1.0.7";
import presetTypography from "https://esm.sh/@twind/preset-typography@1.0.7";
import presetLineClamp from "https://esm.sh/@twind/preset-line-clamp@1.0.7";

const join = (...str: string[]) => str.join("/").replace(/\/\//g, "/");

export default (prefix: string) =>
  defineConfig({
    presets: [
      presetAutoprefix(),
      presetTailwind(),
      presetTypography(),
      presetLineClamp(),
    ],
    rules: [
      ["drag-none", { "user-drag": "none", "-webkit-user-drag": "none" }],
    ],
    preflight: {
      "@font-face": [
        {
          fontFamily: '"Inter"',
          src: `url("${join(
            prefix,
            "/static/assets/fonts/Inter/Inter.var.woff2"
          )}") format("woff2")`,
          fontStyle: "normal",
          fontDisplay: "swap",
        },
        {
          fontFamily: '"Remix Icon"',
          src: `url("${join(
            prefix,
            "/static/assets/fonts/RemixIcon/remixicon.woff2"
          )}") format("woff2")`,
          fontStyle: "normal",
          fontDisplay: "swap",
        },
      ],
    },
    theme: {
      fontFamily: {
        icon: [['"Remix Icon"', "Inter", "Arial"]],
        "sans-serif": [
          [
            "Inter",
            "ui-sans-serif",
            "system-ui",
            "-apple-system",
            "BlinkMacSystemFont",
            "Segoe UI",
            "Roboto",
            "Helvetica Neue",
            "Arial",
            "Noto Sans",
            "sans-serif",
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol",
            "Noto Color Emoji",
          ].join(", "),
          {
            fontFeatureSettings: '"cv11", "ss01"',
            fontVariationSettings: '"opsz" 32',
          },
        ],
      },
      extend: {
        gridTemplateColumns: ({ theme }) => {
          const spacing = theme("spacing");
          return Object.keys(spacing).reduce(
            (acc, key) => ({
              ...acc,
              [`fill-${key}`]: `repeat(auto-fill, minmax(${spacing[key]}, 1fr))`,
            }),
            {}
          );
        },
      },
    },
  });

let done = false;
export const twind = (twindOptions: TwindConfig) => {
  if (done) return;
  done = true;
  const tw = install(twindOptions);
  observe(tw);
};
