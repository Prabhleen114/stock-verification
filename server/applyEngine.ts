import prisma from './db.ts';
import { exportCatalogJson } from '../../scripts/export-catalog-json.ts';
import { isFragranceOilOrWax } from './classifier.ts';

export interface ApplyOptions {
  mode: 'STOCK_ONLY' | 'FULL';
  approvedChangeIds?: string[];
  actor?: string;
}

export interface ApplyReport {
  runId: string;
  appliedCount: number;
  conflictCount: number;
  skippedLockedCount: number;
  newProductsCreated: number;
  auditLogsWritten: number;
  catalogJsonExported: boolean;
  exportedProductsCount: number;
  errors: string[];
}

/**
 * Transactional Apply Engine:
 * Applies StagingChange records to live Product rows using Compare-and-Swap.
 * Writes SyncAuditLog records and exports read-only products.json.
 */
export async function applyCrawlRun(
  runId: string,
  options: ApplyOptions = { mode: 'STOCK_ONLY' }
): Promise<ApplyReport> {
  const crawlRun = await prisma.crawlRun.findUnique({
    where: { id: runId },
  });
  if (!crawlRun) {
    throw new Error(`CrawlRun ${runId} not found.`);
  }

  if (crawlRun.status === 'APPLIED') {
    throw new Error(`CrawlRun ${runId} has already been APPLIED.`);
  }

  // Set run status to APPLYING
  await prisma.crawlRun.update({
    where: { id: runId },
    data: { status: 'APPLYING' },
  });

  const actor = options.actor || 'SYSTEM_CRAWLER';
  const errors: string[] = [];
  let appliedCount = 0;
  let conflictCount = 0;
  let skippedLockedCount = 0;
  let newProductsCreated = 0;
  let auditLogsWritten = 0;

  try {
    // 1. Fetch eligible staging changes
    let whereCondition: any = {
      runId,
      status: 'PENDING',
    };

    if (options.mode === 'STOCK_ONLY') {
      whereCondition.changeType = {
        in: ['STOCK_CHANGED', 'DISCONTINUED', 'REAPPEARED'],
      };
    } else if (options.approvedChangeIds && options.approvedChangeIds.length > 0) {
      whereCondition.id = { in: options.approvedChangeIds };
    }

    const changes = await prisma.stagingChange.findMany({
      where: whereCondition,
    });

    console.log(
      `[ApplyEngine] Processing ${changes.length} changes for CrawlRun ${runId} in mode ${options.mode}...`
    );

    // 2. Process in chunks of 100 inside safe transactions
    const CHUNK_SIZE = 100;
    for (let i = 0; i < changes.length; i += CHUNK_SIZE) {
      const chunk = changes.slice(i, i + CHUNK_SIZE);

      await prisma.$transaction(
        async (tx) => {
          for (const change of chunk) {
            // A. Existing product updates (STOCK_CHANGED, DISCONTINUED, REAPPEARED, PRICE_CHANGED)
            if (change.targetProductId) {
              const liveProduct = await tx.product.findUnique({
                where: { id: change.targetProductId },
              });

              if (!liveProduct) {
                await tx.stagingChange.update({
                  where: { id: change.id },
                  data: {
                    status: 'CONFLICT',
                    conflictNote: 'Target live Product row was deleted.',
                  },
                });
                conflictCount++;
                continue;
              }

              // Compare-and-Swap version check
              const beforeSnapshot = change.before as any;
              if (beforeSnapshot && beforeSnapshot.version !== undefined) {
                if (liveProduct.version !== beforeSnapshot.version) {
                  await tx.stagingChange.update({
                    where: { id: change.id },
                    data: {
                      status: 'CONFLICT',
                      conflictNote: `Version mismatch: expected ${beforeSnapshot.version}, but found ${liveProduct.version}. Product was modified by admin or another process.`,
                    },
                  });
                  conflictCount++;
                  continue;
                }
              }

              const lockedFields = new Set(liveProduct.lockedFields || []);
              const updateData: any = {
                version: { increment: 1 },
                lastSyncedAt: new Date(),
              };

              const afterData = change.after as any;

              // Stock update
              if (
                change.changeType === 'STOCK_CHANGED' ||
                change.changeType === 'DISCONTINUED' ||
                change.changeType === 'REAPPEARED'
              ) {
                if (lockedFields.has('supplierAvailable') || lockedFields.has('stock')) {
                  skippedLockedCount++;
                } else {
                  updateData.supplierAvailable = afterData.supplierAvailable;
                  updateData.stock = afterData.stock;

                  // Audit log for stock
                  await tx.syncAuditLog.create({
                    data: {
                      runId,
                      stagingChangeId: change.id,
                      productId: liveProduct.id,
                      field: 'supplierAvailable',
                      oldValue: {
                        supplierAvailable: liveProduct.supplierAvailable,
                        stock: liveProduct.stock,
                      },
                      newValue: {
                        supplierAvailable: afterData.supplierAvailable,
                        stock: afterData.stock,
                      },
                      actor,
                    },
                  });
                  auditLogsWritten++;
                }
              }

              // Price update
              if (change.changeType === 'PRICE_CHANGED') {
                if (lockedFields.has('price')) {
                  skippedLockedCount++;
                } else {
                  updateData.price = afterData.price;

                  // Audit log for price
                  await tx.syncAuditLog.create({
                    data: {
                      runId,
                      stagingChangeId: change.id,
                      productId: liveProduct.id,
                      field: 'price',
                      oldValue: { price: liveProduct.price },
                      newValue: { price: afterData.price },
                      actor,
                    },
                  });
                  auditLogsWritten++;
                }
              }

              // Perform CAS update
              await tx.product.update({
                where: {
                  id: liveProduct.id,
                  version: liveProduct.version,
                },
                data: updateData,
              });

              // Mark SupplierProduct as applied
              await tx.supplierProduct.updateMany({
                where: {
                  supplierKey: change.supplierKey,
                  externalProductId: change.externalProductId,
                  externalVariantId: change.externalVariantId,
                },
                data: {
                  appliedHash: (await tx.supplierProduct.findFirst({
                    where: {
                      supplierKey: change.supplierKey,
                      externalProductId: change.externalProductId,
                      externalVariantId: change.externalVariantId,
                    },
                    select: { contentHash: true },
                  }))?.contentHash,
                },
              });

              // Mark StagingChange as applied
              await tx.stagingChange.update({
                where: { id: change.id },
                data: {
                  status: 'APPLIED',
                  appliedAt: new Date(),
                },
              });

              appliedCount++;
            }
            // B. Approved NEW products (FULL mode only)
            else if (change.changeType === 'NEW' && options.mode === 'FULL') {
              const afterData = change.after as any;

              // Mandatory rule check: never add fragrance oils or waxes
              if (
                isFragranceOilOrWax({
                  title: afterData.title,
                  handle: afterData.handle,
                  tags: afterData.rawPayload?.product?.tags,
                })
              ) {
                await tx.stagingChange.update({
                  where: { id: change.id },
                  data: {
                    status: 'REJECTED',
                    conflictNote: 'Safety constraint rejected: Fragrance oils and waxes are prohibited from automated intake.',
                  },
                });
                continue;
              }

              const categoryId = change.categoryId;
              const priceRupees = afterData.priceRupees || Math.round(change.suggestedPrice / 100);

              const createdProduct = await tx.product.create({
                data: {
                  title: afterData.title,
                  category: afterData.categoryName || 'General Silicone Moulds',
                  categoryId,
                  price: priceRupees,
                  stock: afterData.supplierAvailable ? 50 : 0,
                  supplierAvailable: afterData.supplierAvailable,
                  status: 'PUBLISHED',
                  imageUrl:
                    afterData.rawPayload?.variant?.featured_image?.src ||
                    afterData.rawPayload?.product?.images?.[0]?.src ||
                    'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80',
                  description:
                    afterData.rawPayload?.product?.body_html ||
                    `Premium quality ${afterData.title} sourced directly for makers and studios.`,
                  wholesaleTiers: [
                    { minQty: 1, maxQty: 9, price: priceRupees, discountPct: 0 },
                    { minQty: 10, maxQty: 49, price: Math.round(priceRupees * 0.95), discountPct: 5 },
                    { minQty: 50, maxQty: null, price: Math.round(priceRupees * 0.9), discountPct: 10 },
                  ],
                },
              });

              // Link SupplierProduct to newly created product
              await tx.supplierProduct.updateMany({
                where: {
                  supplierKey: change.supplierKey,
                  externalProductId: change.externalProductId,
                  externalVariantId: change.externalVariantId,
                },
                data: {
                  productId: createdProduct.id,
                  matchMethod: 'NEW_INGESTION',
                  appliedHash: (await tx.supplierProduct.findFirst({
                    where: {
                      supplierKey: change.supplierKey,
                      externalProductId: change.externalProductId,
                      externalVariantId: change.externalVariantId,
                    },
                    select: { contentHash: true },
                  }))?.contentHash,
                },
              });

              // Audit log for new product creation
              await tx.syncAuditLog.create({
                data: {
                  runId,
                  stagingChangeId: change.id,
                  productId: createdProduct.id,
                  field: 'status',
                  oldValue: undefined,
                  newValue: { status: 'PUBLISHED', title: createdProduct.title },
                  actor,
                },
              });

              // Mark change as applied
              await tx.stagingChange.update({
                where: { id: change.id },
                data: {
                  status: 'APPLIED',
                  appliedAt: new Date(),
                  targetProductId: createdProduct.id,
                },
              });

              appliedCount++;
              newProductsCreated++;
              auditLogsWritten++;
            }
          }
        },
        { timeout: 30000 }
      );
    }

    // 3. Mark CrawlRun as APPLIED
    await prisma.crawlRun.update({
      where: { id: runId },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
      },
    });

    console.log(
      `[ApplyEngine] Run ${runId} applied successfully. Applied: ${appliedCount}, Conflicts: ${conflictCount}, Locked: ${skippedLockedCount}`
    );

    // 4. Trigger read-only products.json export from PostgreSQL
    console.log('[ApplyEngine] Exporting refreshed catalog from PostgreSQL to products.json...');
    const exportedCount = await exportCatalogJson();

    return {
      runId,
      appliedCount,
      conflictCount,
      skippedLockedCount,
      newProductsCreated,
      auditLogsWritten,
      catalogJsonExported: true,
      exportedProductsCount: exportedCount,
      errors,
    };
  } catch (err: any) {
    console.error(`[ApplyEngine] Fatal error applying run ${runId}:`, err);
    errors.push(err.message);
    throw err;
  }
}

/**
 * Rollback Engine (revertRun):
 * Replays SyncAuditLog backwards inside transactions to undo any applied run.
 */
export async function revertCrawlRun(runId: string): Promise<{
  success: boolean;
  revertedCount: number;
  exportedProductsCount: number;
}> {
  console.log(`[ApplyEngine] Initializing rollback for CrawlRun ${runId}...`);

  const auditLogs = await prisma.syncAuditLog.findMany({
    where: {
      runId,
      revertedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (auditLogs.length === 0) {
    console.log(`[ApplyEngine] No unreverted audit logs found for run ${runId}.`);
    return { success: true, revertedCount: 0, exportedProductsCount: 0 };
  }

  let revertedCount = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const log of auditLogs) {
        if (!log.productId) continue;

        const liveProduct = await tx.product.findUnique({
          where: { id: log.productId },
        });

        if (!liveProduct) continue;

        const oldValue = log.oldValue as any;
        const revertData: any = {
          version: { increment: 1 },
          lastSyncedAt: new Date(),
        };

        if (log.field === 'supplierAvailable' && oldValue) {
          revertData.supplierAvailable = oldValue.supplierAvailable;
          if (oldValue.stock !== undefined) {
            revertData.stock = oldValue.stock;
          }
        } else if (log.field === 'price' && oldValue) {
          revertData.price = oldValue.price;
        } else if (log.field === 'status' && oldValue === null) {
          // If product was created during this run, unpublish it
          revertData.status = 'DRAFT';
        }

        await tx.product.update({
          where: { id: liveProduct.id },
          data: revertData,
        });

        await tx.syncAuditLog.update({
          where: { id: log.id },
          data: { revertedAt: new Date() },
        });

        revertedCount++;
      }

      // Mark CrawlRun as ROLLED_BACK
      await tx.crawlRun.update({
        where: { id: runId },
        data: {
          status: 'ROLLED_BACK',
        },
      });
    },
    { timeout: 30000 }
  );

  console.log(`[ApplyEngine] Rollback complete. Reverted ${revertedCount} field changes.`);

  // Refresh products.json back to pre-run state
  const exportedCount = await exportCatalogJson();

  return {
    success: true,
    revertedCount,
    exportedProductsCount: exportedCount,
  };
}
