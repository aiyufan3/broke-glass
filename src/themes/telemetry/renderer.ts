import { LINES, LINES_PER_CHANNEL, SAMPLES, SCAN, SCOPE, SPARK, STRIP, acquiredPass, channelLine, findPeak, lineDepth, microns, oscillator, profile, profileRange, project, relief, shot, traceStats } from './signal'
import type { Sweep } from './signal'

const INK = '#0d0d0d'
const THERMAL = '#ff3b00'
const RUST = '#aa300f'
const BLUE = '#0047ff'
const RULE = '#9c988a'
const LABEL = '8px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'

type Instrument = {
  sweep: Sweep
  channel: number
  noise: number
  gain: number
  stress: boolean
}

const channelColor = (channel: number) => channel % 2 ? BLUE : RUST

function surfacePaths(view: Instrument, height: number) {
  const plain = new Path2D()
  const selected = new Path2D()
  const jitter = view.noise * 2.6 + (view.stress ? 1.8 : 0)
  for (let line = 0; line < LINES; line++) {
    const depth = lineDepth(line)
    const path = Math.floor(line / LINES_PER_CHANNEL) === view.channel ? selected : plain
    for (let sample = 0; sample < SAMPLES; sample++) {
      const u = sample / (SAMPLES - 1)
      const pass = acquiredPass(u, view.sweep)
      const [x, y] = project(u, depth, relief(u, depth, pass) + shot(u, line, pass) * jitter, height)
      if (sample) path.lineTo(x, y)
      else path.moveTo(x, y)
    }
  }
  return { plain, selected }
}

export function paintScan(ctx: CanvasRenderingContext2D, view: Instrument, height: number) {
  const { sweep, channel, gain } = view
  const { plain, selected } = surfacePaths(view, height)
  const color = channelColor(channel)
  const beamX = project(sweep.beam, lineDepth(channelLine(channel)), 0, height)[0]
  ctx.clearRect(0, 0, SCAN.width, height)
  ctx.lineWidth = .65
  ctx.lineJoin = 'round'

  const region = (from: number, to: number, draw: () => void) => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(from, 0, to - from, height)
    ctx.clip()
    draw()
    ctx.restore()
  }
  region(beamX, SCAN.width, () => {
    ctx.strokeStyle = INK
    ctx.globalAlpha = .2
    ctx.stroke(plain)
    ctx.strokeStyle = color
    ctx.globalAlpha = .36
    ctx.stroke(selected)
  })
  region(0, beamX, () => {
    ctx.strokeStyle = INK
    ctx.globalAlpha = .42
    ctx.stroke(plain)
    ctx.strokeStyle = color
    ctx.lineWidth = .9
    ctx.globalAlpha = .96
    ctx.stroke(selected)
  })
  // Persistence: lines the beam has just written are darkest and decay over a width set by detector gain.
  const persistence = 26 + gain * 94
  region(beamX - persistence, beamX, () => {
    const decay = ctx.createLinearGradient(beamX - persistence, 0, beamX, 0)
    decay.addColorStop(0, '#0d0d0d00')
    decay.addColorStop(1, INK)
    ctx.strokeStyle = decay
    ctx.lineWidth = .85
    ctx.globalAlpha = .5 + gain * .5
    ctx.stroke(plain)
  })

  ctx.globalAlpha = 1
  ctx.lineWidth = .9
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.font = LABEL
  ctx.textBaseline = 'alphabetic'
  ctx.beginPath()
  const rule = Math.round(height) - 17.5
  ctx.moveTo(14.5, rule - 3.5)
  ctx.lineTo(14.5, rule + 3.5)
  ctx.moveTo(14.5, rule)
  ctx.lineTo(56.5, rule)
  ctx.moveTo(56.5, rule - 3.5)
  ctx.lineTo(56.5, rule + 3.5)
  ctx.stroke()
  ctx.fillText('250 μm', 17, rule + 12)

  const peak = findPeak(channel, sweep)
  const [peakX, peakY] = project(peak.u, lineDepth(channelLine(channel)), peak.height, height)
  const flag = peakX > 250 ? -1 : 1
  ctx.strokeStyle = RUST
  ctx.fillStyle = RUST
  ctx.beginPath()
  ctx.moveTo(peakX - 6, peakY)
  ctx.lineTo(peakX + 6, peakY)
  ctx.moveTo(peakX, peakY - 6)
  ctx.lineTo(peakX, peakY + 6)
  ctx.moveTo(peakX, peakY)
  ctx.lineTo(peakX + flag * 14, peakY - 12)
  ctx.lineTo(peakX + flag * 22, peakY - 12)
  ctx.stroke()
  ctx.textAlign = flag > 0 ? 'left' : 'right'
  ctx.fillText(`PEAK ${microns(peak.height).toFixed(1)} μm`, peakX + flag * 25, peakY - 9)
  ctx.textAlign = 'left'
  ctx.fillStyle = THERMAL
  ctx.globalAlpha = .45 + gain * .55
  ctx.beginPath()
  ctx.arc(peakX, peakY, 2.2 + gain * 1.4, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.fillRect(Math.round(beamX), 0, 1, height)
  ctx.beginPath()
  ctx.moveTo(beamX - 3.5, 0)
  ctx.lineTo(beamX + 4.5, 0)
  ctx.lineTo(beamX + .5, 6)
  ctx.fill()
}

export function paintScope(ctx: CanvasRenderingContext2D, view: Instrument, time: number) {
  const { sweep, channel, noise, gain, stress } = view
  const { width, height } = SCOPE
  const beamX = sweep.beam * width
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.globalAlpha = .55
  ctx.beginPath()
  for (let division = 1; division < 10; division++) {
    const x = Math.round(division * width / 10) + .5
    ctx.moveTo(x, division === 5 ? 0 : height / 2 - 3)
    ctx.lineTo(x, division === 5 ? height : height / 2 + 3)
  }
  ctx.stroke()

  const amplitude = .34 + gain * .3 + (stress ? .14 : 0)
  const hiss = noise * .09 + (stress ? .1 : 0)
  const range = profileRange(channel, sweep)
  const trace = (from: number, to: number) => {
    ctx.beginPath()
    for (let x = from; x <= to; x += 1.5) {
      const u = x / width
      const signal = (profile(channel, sweep, u) - range.low) / range.span * 2 - 1
      const ripple = Math.sin(x * 1.16 + time * 17) * hiss + shot(u, channel, acquiredPass(u, sweep)) * hiss * .6
      const y = height * (.5 - signal * amplitude * .62 + ripple)
      if (x === from) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.strokeStyle = channelColor(channel)
  ctx.lineWidth = 1.2 + gain * .7
  ctx.globalAlpha = 1
  trace(0, beamX)
  ctx.globalAlpha = .3
  trace(beamX, width)
  ctx.globalAlpha = 1
  ctx.fillStyle = THERMAL
  ctx.fillRect(Math.round(beamX), 0, 1, height)
}

export type Spark =
  | { kind: 'latency'; trace: readonly number[] }
  | { kind: 'profile'; channel: number; sweep: Sweep }
  | { kind: 'index'; matches: readonly boolean[] }
  | { kind: 'audio'; wave: 'sine' | 'triangle'; frequency: number; playing: boolean }

export function paintSpark(ctx: CanvasRenderingContext2D, spark: Spark, time: number) {
  const { width, height } = SPARK
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 1.1
  ctx.globalAlpha = 1
  if (spark.kind === 'index') {
    const step = width / spark.matches.length
    spark.matches.forEach((matched, index) => {
      ctx.fillStyle = matched ? RUST : RULE
      const tall = matched ? height - 6 : 4
      ctx.fillRect(index * step + 1.5, height - 3 - tall, step - 3, tall)
    })
    return
  }
  const range = spark.kind === 'profile' ? profileRange(spark.channel, spark.sweep) : null
  ctx.beginPath()
  for (let x = 0; x <= width; x++) {
    const u = x / width
    let level = 0
    if (spark.kind === 'latency') {
      const { min, max } = traceStats(spark.trace)
      const position = u * (spark.trace.length - 1)
      const left = Math.floor(position)
      const value = spark.trace[left] + (spark.trace[Math.min(spark.trace.length - 1, left + 1)] - spark.trace[left]) * (position - left)
      level = (value - min) / Math.max(.4, max - min) * 2 - 1
    } else if (spark.kind === 'profile' && range) {
      level = (profile(spark.channel, spark.sweep, u) - range.low) / range.span * 2 - 1
    } else if (spark.kind === 'audio') {
      level = oscillator(spark.wave, u * spark.frequency * .34 - (spark.playing ? time * 7 : 0)) * (spark.playing ? .92 : .5)
    }
    const y = height / 2 - Math.max(-1, Math.min(1, level)) * (height / 2 - 3)
    if (x) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.strokeStyle = spark.kind === 'latency' ? RUST : BLUE
  ctx.stroke()
  if (spark.kind !== 'profile') return
  ctx.fillStyle = THERMAL
  ctx.fillRect(Math.round(spark.sweep.beam * width), 0, 1, height)
}

export function paintStrip(ctx: CanvasRenderingContext2D, trace: readonly number[], stress: boolean) {
  const { width, height } = STRIP
  const { min, max, mean } = traceStats(trace)
  const span = Math.max(.6, max - min)
  const toY = (value: number) => height - 9 - (value - min) / span * (height - 20)
  const step = (width - 40) / (trace.length - 1)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = RULE
  ctx.fillStyle = '#514b41'
  ctx.lineWidth = 1
  ctx.font = LABEL
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 1
  ctx.beginPath()
  for (const value of [min, mean, max]) {
    const y = Math.round(toY(value)) + .5
    ctx.moveTo(0, y)
    ctx.lineTo(width - 40, y)
    ctx.fillText(value.toFixed(1), width - 34, y)
  }
  for (let sample = 0; sample < trace.length; sample += 8) {
    const x = Math.round(sample * step) + .5
    ctx.moveTo(x, height - 5)
    ctx.lineTo(x, height)
  }
  ctx.stroke()
  ctx.strokeStyle = stress ? THERMAL : INK
  ctx.lineWidth = 1.25
  ctx.beginPath()
  trace.forEach((value, index) => {
    if (index) ctx.lineTo(index * step, toY(value))
    else ctx.moveTo(0, toY(value))
  })
  ctx.stroke()
  ctx.fillStyle = THERMAL
  ctx.fillRect((trace.length - 1) * step - 2, toY(trace[trace.length - 1]) - 2, 5, 5)
}
