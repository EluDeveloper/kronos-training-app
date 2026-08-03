/**
 * plugins/webfontloader.js
 *
 * webfontloader documentation: https://github.com/typekit/webfontloader
 */

export async function loadFonts() {
  const webFontLoader = await import(/* webpackChunkName: "webfontloader" */'webfontloader')

  webFontLoader.load({
    google: {
      api: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Mulish:wght@400;500;600;700&family=Syncopate:wght@700&display=swap',
      families: [
        'Montserrat:600,700',
        'Mulish:400,500,600,700',
        'Syncopate:700',
      ],
    },
  })
}

export default function () {
  loadFonts()
}
