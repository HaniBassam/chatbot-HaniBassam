import express from "express";
import cors from "cors";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";

const app = express();
const PORT = 4000; // kør API’et på en anden port end din SSR server

// Middleware
app.use(express.json()); // forstår JSON-body
app.use(cors());         // åbner for fetch fra andre domæner

const DATA_FILE = "./data/messages.json";