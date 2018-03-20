(letrec
    (
     ;; (even? (lambda (n)
     ;;          (if (eqv? n 0)
     ;;              #t
     ;;              (not (odd? (- n 1))))))
     ;; (odd? (lambda (n)
     ;;         (if (eqv? n 1)
     ;;             #t
     ;;             (not (even? (- n 1))))))
     (even? (lambda (n) (eqv? (mod n 2) 0)))
     (odd? (lambda (n) (eqv? (mod n 2) 1)))
     (loop
      (lambda (n max)
        (if (> n max)
            #t
            (begin
              (if (odd? n)
                (begin
                  (display n)
                  (display " odd")
                  (newline))
                (begin
                  (display n)
                  (display " even")
                  (newline)))
            (loop (+ n 1) max))))))
  (loop 1 10))
