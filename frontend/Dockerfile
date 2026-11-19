# Stage 1: Build the React frontend
FROM node:24-alpine AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_API_URL=http://localhost:5080
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve the built website
FROM nginx:alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80
