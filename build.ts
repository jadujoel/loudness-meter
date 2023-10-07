import copy from "bun-copy-plugin"

Bun.build({
  entrypoints: ['src/index.ts'],
  minify: true,
  outdir: 'dist',
  sourcemap: 'external',
  target: 'browser',
  plugins: [
    copy('static/', 'dist')
  ],
}).then(output => {
  if (!output.success) {
    output.logs.map(console.log)
  }
})
