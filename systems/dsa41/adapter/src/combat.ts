// Weapon target values the adapter puts into BundleItem.extra and the dsa-41 Foundry hooks read.
// Kept free of the catalog so the Foundry module does not bundle it.
import type { BundleItem } from '../../../../packages/core/src/types.ts'

export interface Dsa41Combat {
  talentSid: string
  AT?: number
  PA?: number
  FK?: number
  INI?: number
}

/** the combat values of an exported item, if it is a weapon */
export const combatOf = (i: BundleItem): Dsa41Combat | undefined => i.extra?.combat as Dsa41Combat | undefined
