FROM node:22

# Copy app
RUN mkdir -p /home/node/app
COPY ./index.js /home/node/app
COPY ./package.json /home/node/app
COPY ./package-lock.json /home/node/app
RUN chown -R node:node /home/node/app

# Make database directory and set permissions
RUN mkdir -p /database
RUN chown -R node:node /database

# Switch to node user
USER node

# Set working directory
WORKDIR /home/node/app

# Install dependencies, generate grammar, and reduce size of kuzu node module
# Done in one step to reduce image size
RUN npm install &&\
    rm -rf node_modules/kuzu/prebuilt node_modules/kuzu/kuzu-source

# Set environment variables
ENV NODE_ENV=production
ENV KUZU_DB_DIR=/database

# Run app
ENTRYPOINT ["node", "index.js"]
