import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vinext applies the Server Action body limit to multipart POST requests
  // before they reach App Router route handlers such as /api/upload.
  // Reference images and videos should be forwarded to ComfyUI unchanged.
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
