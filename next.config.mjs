/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The e2e suite runs its own `next dev` (NEXT_DIST_DIR=.next-e2e) so it never shares .next with the dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Animates recipe list <-> detail navigation (shared image and title) with React's <ViewTransition>.
  experimental: { viewTransition: true },
  // Listas, Plantillas and Planificación were merged into Compras.
  async redirects() {
    return [
      { source: "/lists", destination: "/groceries/cart", permanent: false },
      { source: "/templates", destination: "/groceries/templates", permanent: false },
      { source: "/planning", destination: "/groceries", permanent: false }
    ];
  }
};

export default nextConfig;
