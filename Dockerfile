FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
COPY data ./data

# Les modifications de l'administrateur sont écrites dans /app/data et /app/public/uploads :
# montez-les sur des volumes persistants (voir le README, section 6).
RUN mkdir -p /app/public/uploads

EXPOSE 3000
USER node
CMD ["node", "server.js"]
