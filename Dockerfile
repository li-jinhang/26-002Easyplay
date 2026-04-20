# 使用轻量化的 Node.js 镜像
#FROM node:18-alpine
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine
# 设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 等配置文件
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 复制其他项目代码
COPY . .

# 修改工作目录的文件所有权，确保非 root 的 node 用户可以正常运行应用（增强安全性）
RUN chown -R node:node /usr/src/app

# 切换为普通用户 node，避免使用 root 运行容器应用
USER node

# 声明容器内部服务监听端口：26902
EXPOSE 26902

# 启动 Node.js 服务器
CMD ["npm", "start"]