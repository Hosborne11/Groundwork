import { useEffect, useState } from 'react'

/*
 * Saved site plans.
 *
 * Plans live in this browser's local storage for now. Everything else in the app goes through
 * the functions below, so moving to Supabase (shared across devices and coworkers) means
 * rewriting only this file: keep the same function names and plan shape.
 *
 * Plan shape:
 *   { id, name, description, created, updated,
 *     parcel: { id, county, address, feature },      // the parcel, so a plan can reopen without a search
 *     settings: { mode, mix, reserve, variant },      // layout type, lot mix, pond size, alternate layout
 *     edit: { streets, ponds, parks, depth } | null,  // hand edits, if any
 *     removed: [[lng, lat], ...],                     // lots the user removed
 *     summary: { lots, pass, district, acres } }      // for lists
 */

const KEY = 'groundwork:plans'
const EVENT = 'groundwork:plans-changed'

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function writeAll(plans) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans))
  } catch {
    throw new Error("This browser couldn't save the plan (storage is full or turned off).")
  }
  window.dispatchEvent(new Event(EVENT))
}
const newId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export async function listPlans(parcelId) {
  const all = readAll().sort((a, b) => b.updated.localeCompare(a.updated))
  return parcelId ? all.filter((p) => p.parcel.id === parcelId) : all
}

export async function getPlan(id) {
  return readAll().find((p) => p.id === id) || null
}

/** Creates a plan (no id) or updates one (with id). Returns the saved plan. */
export async function savePlan(plan) {
  const all = readAll()
  const now = new Date().toISOString()
  if (plan.id) {
    const i = all.findIndex((p) => p.id === plan.id)
    if (i >= 0) { all[i] = { ...all[i], ...plan, updated: now }; writeAll(all); return all[i] }
  }
  const created = { ...plan, id: newId(), created: now, updated: now }
  writeAll([created, ...all])
  return created
}

export async function renamePlan(id, name, description) {
  const all = readAll()
  const p = all.find((x) => x.id === id)
  if (!p) return null
  p.name = name
  if (description !== undefined) p.description = description
  p.updated = new Date().toISOString()
  writeAll(all)
  return p
}

export async function duplicatePlan(id) {
  const p = await getPlan(id)
  if (!p) return null
  const { id: _old, created, updated, ...rest } = p
  return savePlan({ ...rest, name: `${p.name} (copy)` })
}

export async function deletePlan(id) {
  writeAll(readAll().filter((p) => p.id !== id))
}

/** Live list of plans (for one parcel, or all), kept current as plans change. */
export function usePlans(parcelId) {
  const [plans, setPlans] = useState([])
  useEffect(() => {
    let live = true
    const load = () => listPlans(parcelId).then((p) => { if (live) setPlans(p) })
    load()
    window.addEventListener(EVENT, load)
    window.addEventListener('storage', load) // another tab saved a plan
    return () => { live = false; window.removeEventListener(EVENT, load); window.removeEventListener('storage', load) }
  }, [parcelId])
  return plans
}
