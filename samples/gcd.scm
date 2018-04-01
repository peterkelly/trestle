;;; Expected result: 7
(letrec
    ((gcd
      (lambda (a b)
        (if (eqv? b 0)
            a
            (gcd b (mod a b))))))
  (gcd 1393 1099))
