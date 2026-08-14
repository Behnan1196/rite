/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dogfood/hızlı iterasyon: lint hataları deploy'u durdurmasın (tip kontrolü açık kalır).
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
