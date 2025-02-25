FROM node:20.12.0

WORKDIR /workspace

COPY package*.json ./

RUN yarn install

COPY . .

CMD ["npm", "run", "dev"]