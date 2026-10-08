FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=diorama_build_ca,required=false \
    if [ -f /run/secrets/diorama_build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/diorama_build_ca; fi; \
    npm ci --omit=dev --ignore-scripts && mkdir -p /app/data && chown node:node /app/data
COPY --chown=node:node server.js store.js catalog.js postgres-store.js ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
