import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. A big roster (hundreds of name/number/size rows)
      // plus a handful of reference photos in the same New Order
      // submission can blow past that easily -- the whole form,
      // including any attached files, goes through this one Server
      // Action call. 20MB comfortably covers a large roster and several
      // normal photo attachments.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
