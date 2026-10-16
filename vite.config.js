import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same /gis/* paths are rewritten by vercel.json in production,
// so the app never calls county servers directly (avoids CORS issues).
const proxy = (target, from, to = '') => ({
  target,
  changeOrigin: true,
  secure: true,
  rewrite: (p) => p.replace(new RegExp('^' + from), to),
})

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/gis/cabarrus': proxy('https://location.cabarruscounty.us', '/gis/cabarrus', '/arcgisservices/rest/services'),
      '/gis/concord': proxy('https://services2.arcgis.com', '/gis/concord', '/0esqB0FgvL32hAbY/arcgis/rest/services'),
      '/gis/fema': proxy('https://hazards.fema.gov', '/gis/fema', '/arcgis/rest/services'),
      '/gis/clt': proxy('https://gis.charlottenc.gov', '/gis/clt', '/arcgis/rest/services'),
      '/gis/agolclt': proxy('https://services.arcgis.com', '/gis/agolclt', '/9Nl857LBlQVyzq54/arcgis/rest/services'),
      '/gis/sda': proxy('https://sdmdataaccess.sc.egov.usda.gov', '/gis/sda', '/Tabular/post.rest'),
    },
  },
})
