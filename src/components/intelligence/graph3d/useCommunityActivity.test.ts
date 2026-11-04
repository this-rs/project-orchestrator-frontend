import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { writeCommunityHullOpacity } from './useCommunityActivity'
import type { CommunityHull } from './CommunityHulls3D'
import {
  COMMUNITY_FILL_OPACITY_REST,
  COMMUNITY_FILL_OPACITY_PEAK,
  COMMUNITY_WIRE_OPACITY_REST,
  COMMUNITY_WIRE_OPACITY_PEAK,
} from './communityActivity'

function mkHull(): CommunityHull {
  const geo = new THREE.BufferGeometry()
  const fillMat = new THREE.MeshBasicMaterial({ opacity: COMMUNITY_FILL_OPACITY_REST, transparent: true })
  const wireMat = new THREE.MeshBasicMaterial({ opacity: COMMUNITY_WIRE_OPACITY_REST, transparent: true })
  return {
    communityId: 3,
    label: 'c3',
    nodeCount: 20,
    dominantType: 'file',
    color: '#ffffff',
    fillMesh: new THREE.Mesh(geo, fillMat),
    wireMesh: new THREE.Mesh(geo, wireMat),
  }
}

describe('writeCommunityHullOpacity', () => {
  it('raises fill + wireframe at intensity 1 and returns exactly to rest at 0', () => {
    const hull = mkHull()
    writeCommunityHullOpacity(hull, 1)
    expect((hull.fillMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_FILL_OPACITY_PEAK)
    expect((hull.wireMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_WIRE_OPACITY_PEAK)

    writeCommunityHullOpacity(hull, 0)
    expect((hull.fillMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_FILL_OPACITY_REST)
    expect((hull.wireMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_WIRE_OPACITY_REST)
  })

  it('clamps a negative / >1 intensity to the [rest, peak] band', () => {
    const hull = mkHull()
    writeCommunityHullOpacity(hull, 5)
    expect((hull.fillMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_FILL_OPACITY_PEAK)
    writeCommunityHullOpacity(hull, -1)
    expect((hull.fillMesh.material as THREE.MeshBasicMaterial).opacity).toBe(COMMUNITY_FILL_OPACITY_REST)
  })
})
