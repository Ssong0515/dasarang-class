FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

# Build the Vite frontend application
RUN npm run build

# Expose the port that the application runs on
EXPOSE 3100

# Start the server
CMD ["npm", "start"]
