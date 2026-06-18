# Serves the Bob-a-gotchi landing page (docs/) as a static site on Railway.
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY docs ./docs
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve docs -l ${PORT:-8080}"]
