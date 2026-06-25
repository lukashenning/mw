# mw

Scripting engine for interactive fiction. A modern React web application built with Figma Make and ported to be fully self-hosted.

**Original Figma Design:** https://www.figma.com/design/JrEYT7M5oGxczBUdxxeGGp/MWengine

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (fast HMR, optimized production builds)
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible component library
- **React Router** - Client-side routing
- **React DnD** - Drag-and-drop
- **Recharts** - Charts & data visualization

## Local Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build
```

## Deployment

### GitHub Pages

For GitHub Pages, you'll need to configure Vite for your repository URL:

1. Update `vite.config.ts` if needed (set `base` if deploying to a subdirectory)
2. Build the app:
   ```bash
   npm install
   npm run build
   ```
3. Push to GitHub and enable Pages to deploy from `dist/` folder, or use GitHub Actions

### Netlify
1. Connect your repository
2. Build command: `npm run build`
3. Publish directory: `dist/`

### Vercel
1. Connect your repository
2. It will auto-detect Vite configuration

### Other Static Hosts
1. Run `npm run build`
2. Upload the `dist/` folder to your hosting

## Environment Variables

Create a `.env` file for configuration:
```
VITE_API_URL=https://your-api.com
```

## Attribution

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for credits and licenses.
