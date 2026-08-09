import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React and the router change only when a dependency is upgraded, but
        // they used to sit in the same chunk as application code - so editing
        // any page invalidated the whole entry bundle for everyone who already
        // had it cached. Splitting them out means a normal release only ships
        // the app chunk, and this one stays in the browser cache.
        //
        // Deliberately limited to the framework: the route chunks that
        // React.lazy already produces are what keep the first paint small, and
        // grouping more libraries here would start pulling code into the
        // initial download that today loads only when a screen needs it.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
})
