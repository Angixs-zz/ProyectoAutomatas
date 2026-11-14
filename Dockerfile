FROM node:22-alpine

# Python 3 permite ejecutar `npm start` en la base inicial de archivos estáticos;
# cuando la API en Node.js reemplace el servidor estático, `npm start` seguirá funcionando igual.
RUN apk add --no-cache python3

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; fi

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
