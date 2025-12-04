# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Accept build args from Railway (CRITICAL for Next.js env vars)
ARG NEXT_PUBLIC_API_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG GOOGLE_CLIENT_ID

# Set as environment variables for Next.js build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID

# Build the Next.js app with env vars
RUN npm run build

# Install curl for health check
RUN apk add --no-cache curl

# Expose port (Railway assigns dynamically via PORT env var)
EXPOSE 3000

# Health check using dynamic PORT
HEALTHCHECK CMD curl -f http://localhost:${PORT:-3000} || exit 1

# Start the app on Railway's dynamic PORT
CMD sh -c "npm start -- -p ${PORT:-3000}"
