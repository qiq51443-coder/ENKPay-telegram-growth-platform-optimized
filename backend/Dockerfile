FROM node:20-alpine

RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

RUN mkdir -p logs

EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js"]
