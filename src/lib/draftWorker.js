// Runs the neighborhood engine off the main thread so the panel stays responsive.
import { neighborhoodDraft } from './neighborhood'

self.onmessage = (e) => {
  const { id, parcel, opts } = e.data
  let result
  try { result = neighborhoodDraft(parcel, opts) } catch (err) { result = { error: `The draft hit a problem with this parcel's shape (${err.message}).` } }
  self.postMessage({ id, result })
}
