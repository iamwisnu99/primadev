        window.switchTab = (tab) => {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById('tab-' + tab)?.classList.add('active');
            document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

            const titles = { overview: 'Overview <span>/ Dashboard</span>', licenses: 'License Manager <span>/ Kelola Lisensi</span>', apps: 'App Manager <span>/ Kelola Produk</span>', extensions: 'Extension Manager <span>/ Kelola Browser Extension</span>', settings: 'Payment Gateway <span>/ Pengaturan Gateway</span>', employees: 'Data Karyawan <span>/ HRD</span>', signature: 'Tanda Tangan Digital <span>/ CEO Signature</span>' };
            document.getElementById('topbarTitle').innerHTML = titles[tab] || tab;

            if (tab === 'employees') {
                window.fetchEmployees();
            }

            closeSidebar();
        };

        window.showModal = (id) => { document.getElementById(id)?.classList.add('show'); };
        window.closeModal = (id) => { document.getElementById(id)?.classList.remove('show'); };
        document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));

        window.toggleDD = (id) => {
            const el = document.getElementById(id);
            document.querySelectorAll('.custom-dropdown').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
            el?.classList.toggle('open');
        };
        window.closeDD = (id) => { document.getElementById(id)?.classList.remove('open'); };
        window.selectOpt = (ddId, value, labelText, labelElId) => {
            const dd = document.getElementById(ddId);
            dd?.querySelector('input[type=hidden]')?.setAttribute('value', value);
            const hiddenInput = dd?.querySelector('input[type=hidden]');
            if (hiddenInput) hiddenInput.value = value;
            const labelEl = document.getElementById(labelElId);
            if (labelEl) labelEl.textContent = labelText;
            dd?.querySelectorAll('.opt-item').forEach(opt => opt.classList.remove('selected'));
            event?.currentTarget?.classList.add('selected');
            dd?.classList.remove('open');
        };
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
            }
        });

        window.openSidebar = () => {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sidebarOverlay').classList.add('show');
        };
        window.closeSidebar = () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('show');
        };

        let signaturePad = null;

        function initSignaturePad() {
            const canvas = document.getElementById('sigCanvas');
            if (!canvas || signaturePad) return;

            signaturePad = new SignaturePad(canvas, {
                backgroundColor: 'rgba(255,255,255,0)',
                penColor: '#1e293b',
                minWidth: 1,
                maxWidth: 3
            });

            signaturePad.addEventListener('beginStroke', () => {
                document.getElementById('sigPlaceholder').style.display = 'none';
            });

            resizeSigCanvas();
        }

        function resizeSigCanvas() {
            const canvas = document.getElementById('sigCanvas');
            if (!canvas) return;
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext('2d').scale(ratio, ratio);
            if (signaturePad) signaturePad.clear();
        }

        window.clearSignature = function () {
            if (signaturePad) {
                signaturePad.clear();
                document.getElementById('sigPlaceholder').style.display = 'flex';
            }
        };

        window.saveSignature = async function () {
            if (!signaturePad || signaturePad.isEmpty()) {
                Swal.fire({ icon: 'warning', title: 'Tanda tangan kosong', text: 'Silakan buat tanda tangan terlebih dahulu.' });
                return;
            }

            const btn = document.getElementById('btnSaveSig');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

            try {
                const dataURL = signaturePad.toDataURL('image/png');

                const tokenRes = await fetch('/.netlify/functions/get-config');
                const cfg = await tokenRes.json();
                const adminToken = cfg.adminToken || '';

                const res = await fetch('/.netlify/functions/signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                    body: JSON.stringify({ type: 'signature', data: dataURL })
                });

                if (!res.ok) throw new Error('Gagal menyimpan');

                showSigPreview(dataURL);
                Swal.fire({ icon: 'success', title: 'Tersimpan!', text: 'Tanda tangan CEO berhasil disimpan dan siap diterapkan.' });

            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Gagal menyimpan', text: err.message });
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan';
            }
        };

        function showSigPreview(dataURL) {
            const img = document.getElementById('sigPreviewImg');
            const empty = document.getElementById('sigPreviewEmpty');
            const badge = document.getElementById('sigStatusBadge');
            const text = document.getElementById('sigStatusText');

            if (dataURL) {
                img.src = dataURL;
                img.style.display = 'block';
                empty.style.display = 'none';
                badge.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#16a34a"></i> <span>Tanda tangan tersimpan dan aktif</span>';
            } else {
                img.style.display = 'none';
                empty.style.display = 'flex';
                badge.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444"></i> <span>Belum ada tanda tangan dikonfigurasi</span>';
            }
        }

        async function loadSavedSignature() {
            try {
                const res = await fetch('/.netlify/functions/signature');
                const data = await res.json();
                showSigPreview(data.signature || null);
            } catch (e) {
                console.warn('Could not load signature', e);
            }
        }

        const _origSwitchTab = window.switchTab;
        window.switchTab = function (tab) {
            _origSwitchTab(tab);
            if (tab === 'signature') {
                setTimeout(() => {
                    initSignaturePad();
                    loadSavedSignature();
                }, 50);
            }
        };

        window.addEventListener('resize', resizeSigCanvas);