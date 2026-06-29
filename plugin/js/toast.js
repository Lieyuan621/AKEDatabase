function showToast(message, type) {
            type = type || 'info';
            var container = document.getElementById('toast-container');
            if (!container) return;
            var toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(function() {
                toast.classList.add('toast-out');
                setTimeout(function() { toast.remove(); }, 400);
            }, 2500);
        }
