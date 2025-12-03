/**
 * plugins/webfontloader.js
 *
 * webfontloader documentation: https://github.com/typekit/webfontloader
 */

export async function loadFonts() {
  const webFontLoader = await import(/* webpackChunkName: "webfontloader" */'webfontloader')

  webFontLoader.load({
    google: {
      api: 'https://fonts.googleapis.com/css2?family=Momo+Trust+Display&display=swap',
      families: [
        'Inter:wght@300;400;500;600;700;900&display=swap',
        'Momo Trust Display":wght@400;500;600;700&display=swap',
      ],
    },
  })
}

export default function () {
  loadFonts()
}
