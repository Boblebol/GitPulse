import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Polyfill for TextEncoder/TextDecoder required by some libraries
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;
