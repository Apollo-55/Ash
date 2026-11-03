FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV VTF_DATA_DIR=/data/vault-to-foundry VTF_PORT=8787
EXPOSE 8787
# run as the same user as Foundry (felddy default: 421:421), set in docker-compose via "user:"
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "server.mjs"]
