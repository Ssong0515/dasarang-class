FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

# Set build argument for Vite
ARG APP_BASE_PATH
ENV APP_BASE_PATH=${APP_BASE_PATH}

# Build the Vite frontend application
RUN npm run build

# Expose the port that the application runs on
EXPOSE 3100

# Start the server
CMD ["npm", "start"]
