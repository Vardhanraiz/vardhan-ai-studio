"""Deployment Assistant: stack detection, config/Dockerfile generation, and cloud guidance."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services import file_service


def detect_project_type(project_rel_path: str, workspace_root: Path) -> dict[str, Any]:
    project_dir = file_service.get_project_root(project_rel_path, workspace_root)

    has_pkg = (project_dir / "package.json").is_file() or (project_dir / "frontend" / "package.json").is_file()
    has_py = (project_dir / "requirements.txt").is_file() or (project_dir / "backend" / "requirements.txt").is_file()
    has_html = (project_dir / "index.html").is_file() or (project_dir / "frontend" / "index.html").is_file()
    has_dotnet = any(project_dir.rglob("*.csproj"))

    stack = "Static HTML/CSS/JS"
    build_cmd = "No build step required (static assets)"
    start_cmd = "Serve static files"
    env_vars = ["APP_ENV=production"]

    if has_pkg and has_py:
        stack = "Full-Stack (React/Vite + Python FastAPI)"
        build_cmd = "cd frontend && npm install && npm run build"
        start_cmd = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
        env_vars = ["DATABASE_URL", "CORS_ORIGINS", "API_AUTH_ENABLED", "API_SECRET_KEY"]
    elif has_py:
        stack = "Python FastAPI Backend"
        build_cmd = "pip install -r requirements.txt"
        start_cmd = "uvicorn main:app --host 0.0.0.0 --port 8000"
        env_vars = ["DATABASE_URL", "APP_ENV=production"]
    elif has_pkg:
        stack = "Node.js / React Frontend"
        build_cmd = "npm install && npm run build"
        start_cmd = "npm run preview"
        env_vars = ["VITE_API_BASE_URL"]
    elif has_dotnet:
        stack = "ASP.NET Core"
        build_cmd = "dotnet publish -c Release -o out"
        start_cmd = "dotnet out/App.dll"
        env_vars = ["ASPNETCORE_ENVIRONMENT=Production", "ConnectionStrings__Default"]
    elif has_html:
        stack = "Static HTML/CSS/JS"

    return {
        "project_slug": project_rel_path,
        "detected_stack": stack,
        "build_command": build_cmd,
        "start_command": start_cmd,
        "environment_variables": env_vars,
    }


def generate_deployment_plan(
    project_rel_path: str,
    target: str,
    workspace_root: Path,
) -> dict[str, Any]:
    info = detect_project_type(project_rel_path, workspace_root)
    stack = info["detected_stack"]

    dockerfile = (
        "FROM python:3.12-slim\n"
        "WORKDIR /app\n"
        "COPY requirements.txt .\n"
        "RUN pip install --no-cache-dir -r requirements.txt\n"
        "COPY . .\n"
        "EXPOSE 8000\n"
        'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n'
        if "Python" in stack
        else "FROM node:20-alpine\n"
        "WORKDIR /app\n"
        "COPY package*.json ./\n"
        "RUN npm ci\n"
        "COPY . .\n"
        "RUN npm run build\n"
        "EXPOSE 4173\n"
        'CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]\n'
    )

    configs: dict[str, dict[str, Any]] = {
        "Vercel": {
            "pricing_note": "Free Hobby tier available for personal projects; Pro tier is paid.",
            "config_filename": "vercel.json",
            "config_content": json.dumps(
                {
                    "buildCommand": info["build_command"],
                    "outputDirectory": "dist",
                    "rewrites": [{"source": "/(.*)", "destination": "/index.html"}],
                },
                indent=2,
            ),
            "steps": [
                "Push your project to GitHub.",
                "Import the repository in Vercel dashboard.",
                f"Set Build Command to `{info['build_command']}` and add required env vars.",
                "Verify the live deployment URL before marking complete.",
            ],
        },
        "Netlify": {
            "pricing_note": "Free Starter tier available; higher bandwidth/teams are paid.",
            "config_filename": "netlify.toml",
            "config_content": (
                "[build]\n"
                f'  command = "{info["build_command"]}"\n'
                '  publish = "dist"\n\n'
                "[[redirects]]\n"
                '  from = "/*"\n'
                '  to = "/index.html"\n'
                "  status = 200\n"
            ),
            "steps": [
                "Save netlify.toml in project root.",
                "Connect GitHub repo in Netlify.",
                "Configure environment variables in Site Settings -> Environment Variables.",
            ],
        },
        "Render": {
            "pricing_note": "Free web service tier spins down on idle; always-on instances are paid.",
            "config_filename": "render.yaml",
            "config_content": (
                "services:\n"
                "  - type: web\n"
                f"    name: {project_rel_path}\n"
                "    env: python\n"
                f'    buildCommand: "{info["build_command"]}"\n'
                f'    startCommand: "{info["start_command"]}"\n'
            ),
            "steps": [
                "Commit render.yaml to your GitHub repository.",
                "In Render, choose New -> Blueprint and select your repo.",
                "Configure secret environment variables and verify /health endpoint.",
            ],
        },
        "Hugging Face Spaces": {
            "pricing_note": "Free CPU Basic Space available; GPU hardware is paid.",
            "config_filename": "Dockerfile",
            "config_content": dockerfile.replace("8000", "7860"),
            "steps": [
                "Create a new Docker Space on Hugging Face.",
                "Ensure the container listens on port 7860.",
                "Push Dockerfile and source code to the Space Git remote.",
            ],
        },
        "AWS": {
            "pricing_note": "External paid cloud service (AWS account + billing required beyond Free Tier).",
            "config_filename": "Dockerfile",
            "config_content": dockerfile,
            "steps": [
                "Build and test Docker image locally (`docker build -t app .`).",
                "Push image to Amazon ECR.",
                "Deploy via AWS App Runner or ECS Fargate with Secrets Manager for env vars.",
            ],
        },
        "Microsoft Azure": {
            "pricing_note": "External paid cloud service (Azure Free Tier/credits limited; production tiers are paid).",
            "config_filename": "Dockerfile",
            "config_content": dockerfile,
            "steps": [
                "Push container image to Azure Container Registry (ACR).",
                "Create an Azure App Service (Web App for Containers) or Container App.",
                "Set Application Settings for environment variables and verify health probe.",
            ],
        },
    }

    selected = configs.get(target, configs["Render"])
    return {
        **info,
        "target": target,
        "dockerfile": dockerfile,
        **selected,
        "verification_note": "This assistant generates configuration and guidance only. Always verify the live URL after deploying.",
    }
