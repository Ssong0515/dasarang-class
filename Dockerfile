FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

# Build-time arguments (baked into Vite frontend bundle)
ARG APP_BASE_PATH
ARG VITE_GOOGLE_PICKER_API_KEY
ARG VITE_GOOGLE_OAUTH_CLIENT_ID
ENV APP_BASE_PATH=${APP_BASE_PATH}
ENV VITE_GOOGLE_PICKER_API_KEY=${VITE_GOOGLE_PICKER_API_KEY}
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=${VITE_GOOGLE_OAUTH_CLIENT_ID}

# Build the Vite frontend application
RUN npm run build

# Firebase App Hosting sets PORT=8080 at runtime
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
