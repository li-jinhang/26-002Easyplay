# Easyplay Mini Game Website

这是一个基于 Node.js 并在 Docker 中运行的经典贪吃蛇小游戏网站示例。

## 🛠️ 技术栈
- **后端**：Node.js + Express
- **前端**：HTML5 Canvas + 原生 JS
- **容器化**：Docker + Docker Compose (基于 `node:18-alpine` 轻量级镜像)

## 📦 环境要求
在运行之前，请确保你的系统已经安装了：
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

## 🚀 快速开始

### 1. 构建并启动容器
确保你已在项目根目录下（即包含 `docker-compose.yml` 的目录）打开终端，并运行以下命令：

```bash
docker-compose up -d --build
```

> **说明**: `-d` 参数表示在后台运行，`--build` 确保构建最新的镜像。

### 2. 访问游戏
容器启动成功后，你可以通过浏览器访问以下地址来游玩贪吃蛇：

👉 **[http://localhost:26002](http://localhost:26002)**

> *(注：容器内部服务监听在 `26902` 端口，通过 Docker Compose 将宿主机的 `26002` 端口映射到了该端口)*

### 3. 停止和移除容器
如果你想停止游戏服务并移除容器，可以在项目根目录执行：

```bash
docker-compose down
```

## 📂 目录结构说明
- `package.json`：定义了项目的基础信息和 Express 依赖。
- `app.js`：Node.js Express Web 基础服务器，用于监听内部端口并提供静态页面托管服务。
- `public/index.html`：前端游戏核心页面，包含了游戏 UI 和贪吃蛇运行逻辑。
- `Dockerfile`：配置了容器的打包规则，指定了轻量化镜像、创建了工作目录，并切换了非 root 权限的 node 用户来提升安全性。
- `docker-compose.yml`：配置了容器服务名、环境变量和端口映射规则（`26002:26902`）。
