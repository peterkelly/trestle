(letrec
    (
     (odd? (lambda (n) (eqv? (mod n 2) 1)))
     (even? (lambda (n) (eqv? (mod n 2) 0)))
     )
  (odd? 5))
