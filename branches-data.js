/* ==========================================================================
   DEFAULT BRANCH DATA
   ໃຊ້ເປັນຂໍ້ມູນຕັ້ງຕົ້ນເທົ່ານັ້ນ (ຄືກັນກັບ departments-data.js):
   - ໜ້າເວັບສາທາລະນະຈະໃຊ້ຊຸດນີ້ ຖ້າຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase ຫຼືຍັງບໍ່ມີ
     ຂໍ້ມູນສາຂາໃນ Firestore
   - ແກ້ໄຂ/ເພີ່ມສາຂາ ແລະ ເລືອກຕຳແໜ່ງທີ່ເປີດຮັບຂອງແຕ່ລະສາຂາໄດ້ຈາກໜ້າ admin
     → ແທັບ "ຈັດການສາຂາ" (ຕຳແໜ່ງອ້າງອີງດ້ວຍ position.id ຈາກ departments)
   - allPositions: true ໝາຍເຖິງສາຂານັ້ນເປີດຮັບທຸກຕຳແໜ່ງທີ່ "ເປີດຮັບ" ຢູ່
     ໃນທຸກພະແນກໂດຍອັດຕະໂນມັດ (ໃຊ້ກັບສຳນັກງານໃຫຍ່) ບໍ່ຕ້ອງລະບຸ positionIds
   ========================================================================== */
export const DEFAULT_BRANCHES = [
  { id: "hq", code: "HQ", name: "ສຳນັກງານໃຫຍ່", order: 1, allPositions: true, positionIds: [] },
  { id: "br-1", code: "01", name: "ສາຂາ 1", order: 2, allPositions: false, positionIds: [] },
  { id: "br-2", code: "02", name: "ສາຂາ 2", order: 3, allPositions: false, positionIds: [] },
  { id: "br-3", code: "03", name: "ສາຂາ 3", order: 4, allPositions: false, positionIds: [] },
  { id: "br-4", code: "04", name: "ສາຂາ 4", order: 5, allPositions: false, positionIds: [] },
  { id: "br-5", code: "05", name: "ສາຂາ 5", order: 6, allPositions: false, positionIds: [] },
  { id: "br-6", code: "06", name: "ສາຂາ 6", order: 7, allPositions: false, positionIds: [] },
  { id: "br-7", code: "07", name: "ສາຂາ 7", order: 8, allPositions: false, positionIds: [] }
];
