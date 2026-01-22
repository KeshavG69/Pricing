# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install dependencies needed for Next.js on Alpine
RUN apk add --no-cache libc6-compat

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (use ci for production builds)
RUN npm ci

# Copy all files
COPY . .

# Accept build args from Railway (CRITICAL for Next.js env vars)
ARG NEXT_PUBLIC_API_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BASIC_PROPOSAL_PRICE
ARG NEXT_PUBLIC_ADVANCED_ANALYSIS_PRICE
ARG NEXT_PUBLIC_TERMS_VERSION

# Set as environment variables for Next.js build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BASIC_PROPOSAL_PRICE=$NEXT_PUBLIC_BASIC_PROPOSAL_PRICE
ENV NEXT_PUBLIC_ADVANCED_ANALYSIS_PRICE=$NEXT_PUBLIC_ADVANCED_ANALYSIS_PRICE
ENV NEXT_PUBLIC_TERMS_VERSION=$NEXT_PUBLIC_TERMS_VERSION

# Set production environment and disable telemetry
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js app with env vars
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
