// lib/face-api-loader.ts
// ─── Face-api.js model loader ─────────────────────────────────────────────────
// Models ต้องวางใน /public/models/
// ดาวน์โหลดจาก: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
// ไฟล์ที่ต้องการ:
//   tiny_face_detector_model-*
//   face_landmark_68_model-*
//   face_recognition_model-*

let modelsLoaded = false

export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return

  // Dynamic import — face-api.js ใช้ได้เฉพาะฝั่ง Client
  const faceapi = await import('face-api.js')
  const MODEL_URL = '/models'

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])

  modelsLoaded = true
  console.log('[face-api] ✅ Models loaded')
}

export type { default as faceapi } from 'face-api.js'

/**
 * ตรวจจับใบหน้าและดึง descriptor จาก <video> element
 * @returns Float32Array (128 dimensions) หรือ null ถ้าไม่เจอใบหน้า
 */
export async function detectFaceDescriptor(
  videoEl: HTMLVideoElement
): Promise<Float32Array | null> {
  const faceapi = await import('face-api.js')

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,        // เล็กลง = เร็วขึ้น เหมาะมือถือ
    scoreThreshold: 0.5,
  })

  const result = await faceapi
    .detectSingleFace(videoEl, options)
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (!result) return null
  return result.descriptor
}

/**
 * เปรียบเทียบ descriptor กับรายการที่เก็บไว้ใน DB
 * @returns { userId, score } ของคนที่ตรงมากที่สุด หรือ null
 */
export function findBestMatch(
  descriptor: Float32Array,
  knownUsers: Array<{ user_id: string; face_vector: number[] }>,
  threshold = 0.5    // cosine distance < 0.5 = match
): { userId: string; score: number } | null {
  if (knownUsers.length === 0) return null

  let bestMatch: { userId: string; score: number } | null = null

  for (const known of knownUsers) {
    if (!known.face_vector || known.face_vector.length !== 128) continue

    const knownArr = new Float32Array(known.face_vector)
    const distance = euclideanDistance(descriptor, knownArr)

    if (!bestMatch || distance < bestMatch.score) {
      bestMatch = { userId: known.user_id, score: distance }
    }
  }

  if (!bestMatch || bestMatch.score > threshold) return null
  return bestMatch
}

/** Euclidean distance (face-api.js ใช้ค่านี้ threshold ~0.6) */
function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}
